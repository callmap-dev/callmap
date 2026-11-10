# frozen_string_literal: true

require "set"

module CallmapRb
  module Extractor
    # The local type flow of ADR-0032: the class of a value receiver, when the rules prove it. A
    # literal is a value of its core class, `Foo.new` and a finder of a model make a value of their
    # class, and a variable has the class that each of its writes sets.
    class TypeFlow
      ACTIVE_RECORD = "ActiveRecord::Base"

      # The class methods of a model that return one record, as a stub of ActiveRecord.
      FINDERS = %w[
        find find_by find_by! find_sole_by sole create create! find_or_create_by find_or_create_by!
        find_or_initialize_by create_or_find_by create_or_find_by!
      ].to_set.freeze

      # `class_chain` gives the classes, the constants and the chains of the load unit, and `methods`
      # every method of the load unit, each with the writes of its def.
      def initialize(class_chain, methods)
        @class_chain = class_chain
        @instance_writes = Hash.new { |writes, key| writes[key] = [] }
        methods.each do |method|
          method["writes"].each do |write|
            next unless write["name"].start_with?("@")

            key = "#{ClassChain.side_of(method)} #{method["owner"]} #{write["name"]}"
            @instance_writes[key] << [method["id"], write["value"]]
          end
        end
        @sharers = {}
      end

      # The full name of the class of a `made` or `variable` receiver, or nil when the rules do not
      # prove it.
      def class_name_of(receiver, caller)
        value = receiver["kind"] == "made" ? receiver : written_value_of(receiver["name"], caller)
        value && class_of_made(value)
      end

      private

      def model?(name, seen)
        return true if name == ACTIVE_RECORD

        owner = @class_chain.classes[name]
        return false if owner.nil? || seen.include?(name)

        seen << name
        superclass = @class_chain.superclass_of(owner)
        return false if superclass.nil?

        parent = @class_chain.constant_of(superclass)
        parent.nil? ? superclass["path"].join("::") == ACTIVE_RECORD : model?(parent, seen)
      end

      def class_of_made(value)
        return value["path"].join("::") if value["by"].nil?

        maker = @class_chain.constant_of(value)
        return if maker.nil? || (value["selfNew"] && @class_chain.module?(maker))

        finder = FINDERS.include?(value["by"]) && model?(maker, Set.new)
        return if value["by"] != "new" && !finder

        maker if @class_chain.find_in(@class_chain.chain_for(maker, :singleton), value["by"]).is_a?(Symbol)
      end

      # Every step of every chain that holds this step, so every method that one object can run.
      def sharers_of(owner, side)
        @sharers["#{side} #{owner}"] ||= [
          *@class_chain.chain_for(owner, side),
          *@class_chain.classes_below(owner, side).flat_map { |each, each_side| @class_chain.chain_for(each, each_side) }
        ].reject { |step| step == :library }.uniq { |step| [step.owner.name, step.side] }
      end

      # The writes that set a variable for the caller. A local variable has each write in the def of
      # the caller. An instance variable has the writes of the one method that alone writes it, among
      # every method that an object of the caller's class can run. A second writer, or a macro there
      # that makes its writer method, leaves it with no write.
      def writes_of(variable, caller)
        unless variable.start_with?("@")
          return caller["writes"].select { |write| write["name"] == variable }.map { |write| write["value"] }
        end

        steps = sharers_of(caller["owner"], ClassChain.side_of(caller))
        setter = "#{variable.delete_prefix("@")}="
        return [] if steps.any? { |step| step.owner.macro_names[step.side].include?(setter) }

        writes = steps.flat_map { |step| @instance_writes.fetch("#{step.side} #{step.owner.name} #{variable}", []) }
        writes.map(&:first).uniq.size == 1 ? writes.map(&:last) : []
      end

      # The value that each write of the variable sets, when every one makes the same class.
      def written_value_of(variable, caller)
        first, *rest = writes_of(variable, caller)
        return if first.nil?

        first_class = class_of_made(first)
        first if rest.all? { |value| !value.nil? && class_of_made(value) == first_class }
      end
    end
  end
end
