# frozen_string_literal: true

require "set"
require_relative "constants"

module CallmapRb
  module Extractor
    # The rules that tie the direct calls of one load unit: a call on `self`, on `super` and on a
    # constant, through the class chain of the class of the caller (ADR-0027). A method is a hash of
    # the Ripper script, with the full name of its owner, its file and its id.
    class ClassChain
      # Every body of one full name in a load unit, merged, as Ruby merges them.
      RubyClass = Struct.new(:name, :bodies, :instance, :singleton, keyword_init: true) do
        def methods_of(side)
          side == :instance ? instance : singleton
        end
      end

      # One step of a class chain: the methods of one side of a class. `:library` stands for a class
      # outside the repo.
      Ancestor = Struct.new(:owner, :side)

      # What each class below a module or an abstract method finds for the name, one of which runs.
      OneOf = Struct.new(:found)

      # The core classes of the literals, the values of `LITERAL_CLASSES` in the Ripper script.
      LITERAL_CLASSES = %w[String Array Hash Symbol Regexp Integer Float].to_set.freeze

      SIDES = %i[instance singleton].freeze

      def self.side_of(method)
        method["singleton"] ? :singleton : :instance
      end

      # `defined_names` holds the name of every `def` of the repo, and `claimed` every file of the
      # scope.
      def initialize(bodies:, methods:, names:, aliases:, defined_names:, claimed:)
        @defined_names = defined_names
        @claimed = claimed
        @classes = {}
        bodies.each { |body| class_of(body["name"]).bodies << body }
        methods.each do |method|
          known_methods = class_of(method["owner"]).methods_of(ClassChain.side_of(method))
          known = known_methods[method["name"]]
          if known.nil? || claimed.include?(method["file"]) || !claimed.include?(known["file"])
            known_methods[method["name"]] = method
          end
        end
        @constants = Constants.new(bodies, names, aliases)
        @chains = {}
        @below = {}
      end

      # How one call site of a method of the load unit ties: `[:call, id]`, `[:one_of, ids]`,
      # `[:open_end, reason]` or `[:library]`.
      def resolution_of(written, caller)
        site = module_new_as_self(written)
        receiver = site["receiver"]
        if site.key?("open")
          missing = receiver["kind"] == "constant" && @constants.constant_of(receiver).nil?
          return [:library] if missing && @constants.library?(receiver)

          return [:open_end, missing ? "missing-module" : site["open"]]
        end
        callee = callee_of(site, caller)
        return [:library] if callee == :library
        return one_of_among(callee.found, site["name"]) if callee.is_a?(OneOf)
        return @claimed.include?(callee["file"]) ? [:call, callee["id"]] : [:library] if callee.is_a?(Hash)
        return [:library] if site["name"] == "new" && receiver["kind"] == "constant"
        return [:library] unless @defined_names.include?(site["name"])

        [:open_end, callee == :none ? "other" : callee]
      end

      private

      def class_of(name)
        @classes[name] ||= RubyClass.new(name: name, bodies: [], instance: {}, singleton: {})
      end

      def mixins_of(owner, kind)
        owner.bodies.flat_map { |body| body["mixins"] }.select { |mixin| mixin["kind"] == kind }.reverse
      end

      # A module as a mixin brings its prepends, its own methods, then its includes.
      def module_chain_of(reference, seen)
        name = @constants.constant_of(reference)
        owner = name && @classes[name]
        return [:library] if owner.nil?

        step = "instance #{owner.name}"
        return [] if seen.include?(step)

        seen << step
        [
          *mixins_of(owner, "prepend").flat_map { |mixin| module_chain_of(mixin, seen) },
          Ancestor.new(owner, :instance),
          *mixins_of(owner, "include").flat_map { |mixin| module_chain_of(mixin, seen) }
        ]
      end

      # A class that includes a Rails concern is extended with the `ClassMethods` of the concern.
      def class_methods_of(reference, seen)
        name = @constants.constant_of(reference)
        class_methods = "#{name}::ClassMethods"
        return [] if name.nil? || !@classes.key?(class_methods)

        module_chain_of({ "nesting" => [], "path" => class_methods.split("::"), "absolute" => true }, seen)
      end

      def superclass_of(owner)
        owner.bodies.find { |body| !body["superclass"].nil? }&.fetch("superclass")
      end

      def own_chain_of(owner, side, seen)
        if side == :instance
          return [
            *mixins_of(owner, "prepend").flat_map { |mixin| module_chain_of(mixin, seen) },
            Ancestor.new(owner, side),
            *mixins_of(owner, "include").flat_map { |mixin| module_chain_of(mixin, seen) }
          ]
        end
        [
          *mixins_of(owner, "singleton-prepend").flat_map { |mixin| module_chain_of(mixin, seen) },
          Ancestor.new(owner, side),
          *mixins_of(owner, "extend").flat_map { |mixin| module_chain_of(mixin, seen) },
          *mixins_of(owner, "include").flat_map { |mixin| class_methods_of(mixin, seen) }
        ]
      end

      def chain_of(name, side, seen)
        owner = @classes[name]
        return [:library] if owner.nil?

        step = "#{side} #{name}"
        return [] if seen.include?(step)

        seen << step
        own = own_chain_of(owner, side, seen)
        superclass = superclass_of(owner)
        return LITERAL_CLASSES.include?(name) ? [*own, :library] : own if superclass.nil?

        parent = @constants.constant_of(superclass)
        return [*own, :library] if parent.nil?

        [*own, *chain_of(parent, side, seen)]
      end

      def chain_for(name, side)
        @chains["#{side} #{name}"] ||= chain_of(name, side, Set.new)
      end

      def module?(name)
        @classes[name]&.bodies&.any? { |body| body["module"] } || false
      end

      def step?(ancestor, owner, side)
        ancestor != :library && ancestor.owner.name == owner && ancestor.side == side
      end

      # The classes, each with the side of its chain, that have this step in their chain.
      def classes_below(owner, side)
        @below["#{side} #{owner}"] ||= @classes.keys.reject { |name| module?(name) }
                                               .product(SIDES)
                                               .select { |name, chain_side| chain_for(name, chain_side).any? { |ancestor| step?(ancestor, owner, side) } }
      end

      def find_in(chain, name)
        chain.each do |ancestor|
          return :library if ancestor == :library

          method = ancestor.owner.methods_of(ancestor.side)[name]
          return method unless method.nil?
        end
        :none
      end

      # What `super` in a method of the owner finds: the first def of the name after the owner.
      def super_of(chain, owner, side, name)
        own = chain.index { |ancestor| step?(ancestor, owner, side) }
        find_in(chain.drop(own.nil? ? 0 : own + 1), name)
      end

      def one_of_below(owner, side, name)
        OneOf.new(classes_below(owner, side).map { |each, each_side| find_in(chain_for(each, each_side), name) })
      end

      def overrides_of(found, owner, side, name)
        found.is_a?(Hash) && found["abstract"] ? one_of_below(owner, side, name) : found
      end

      def callee_on_self(caller, name)
        owner = caller["owner"]
        side = ClassChain.side_of(caller)
        found = find_in(chain_for(owner, side), name)
        unfound = found == :none || (found == :library && !classes_below(owner, side).empty?)
        return one_of_below(owner, side, name) if unfound && side == :instance && module?(owner)

        overrides_of(found, owner, side, name)
      end

      def callee_on_super(caller, name)
        owner = caller["owner"]
        side = ClassChain.side_of(caller)
        found = super_of(chain_for(owner, side), owner, side, name)
        return found unless found == :none
        return :library if side != :instance || !module?(owner)

        OneOf.new(classes_below(owner, side).map { |each, each_side| super_of(chain_for(each, each_side), owner, side, name) })
      end

      def callee_on_constant(receiver, name)
        constant = @constants.constant_of(receiver)
        return @constants.library?(receiver) ? :library : "missing-module" if constant.nil?
        return overrides_of(find_in(chain_for(constant, :singleton), name), constant, :singleton, name) if name != "new"

        own_new = find_in(chain_for(constant, :singleton), "new")
        return own_new if own_new.is_a?(Hash)

        initialize = find_in(chain_for(constant, :instance), "initialize")
        initialize == :none ? :library : initialize
      end

      # A call on a value, whose class only the type flow proves, is untyped.
      def callee_of(site, caller)
        receiver = site["receiver"]
        name = site["name"]
        case receiver["kind"]
        when "self" then callee_on_self(caller, name)
        when "super" then callee_on_super(caller, name)
        when "constant" then callee_on_constant(receiver, name)
        else "untyped"
        end
      end

      def one_of_among(found, name)
        callees = found.filter_map do |method|
          method["id"] if method.is_a?(Hash) && !method["abstract"] && @claimed.include?(method["file"])
        end.uniq
        return [:one_of, callees] unless callees.empty?
        return [:library] if found.include?(:library) || !@defined_names.include?(name)

        [:open_end, "no-implementation"]
      end

      def module_new_as_self(site)
        receiver = site["receiver"]
        return site unless receiver["kind"] == "constant" && receiver["selfNew"]

        owner = @constants.constant_of(receiver)
        owner && module?(owner) ? site.merge("receiver" => { "kind" => "self" }) : site
      end
    end
  end
end
