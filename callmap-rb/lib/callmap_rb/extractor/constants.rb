# frozen_string_literal: true

require "set"

module CallmapRb
  module Extractor
    # What a load unit knows of its constant references. A reference is a hash of the Ripper script:
    # `nesting` holds the namespaces that the reference was written inside, innermost first, each one
    # as its segments, and `absolute` is set for `::Foo`, which skips the nesting.
    class Constants
      def self.namespaces_of(name)
        segments = name.split("::")
        segments.each_index.map { |index| segments[0..index].join("::") }
      end

      # A name that an alias makes stands for the constant that its target resolves to, through a
      # chain of aliases. When the target does not resolve, as in a cycle of aliases, the name
      # resolves as it would with no alias.
      def initialize(bodies, names, aliases)
        @targets = aliases.to_h { |each| [each["name"], each["target"]] }
        full_names = bodies.map { |body| body["name"] } + names
        @declared = full_names.flat_map { |name| Constants.namespaces_of(name) }.to_set
        @constants = @declared | @targets.keys.flat_map { |name| Constants.namespaces_of(name) }
        @segments = full_names.flat_map { |name| name.split("::") }.to_set
      end

      # The full name of the unit that a reference resolves to, if any.
      def constant_of(reference)
        resolved(reference, Set.new)
      end

      # Whether a reference that does not resolve names a constant of a library: no body of the unit
      # and no Zeitwerk name has a segment named as its first segment, and the first segment resolves
      # to no constant of the repo. An alias whose target does not resolve stands for its target.
      def library?(reference)
        library_in?(reference, Set.new)
      end

      private

      def followed(name, seen)
        target = @targets[name]
        return name if target.nil?

        followed_target = seen.include?(name) ? nil : resolved(target, seen | [name])
        followed_target || (@declared.include?(name) ? name : nil)
      end

      # A constant is not set yet while its own assignment reads its target, so the lookup skips it.
      def lexical_of(reference, seen)
        head = reference["path"].first
        return nil if head.nil?

        lexical = if reference["absolute"]
                    [head]
                  else
                    reference["nesting"].map { |namespace| [*namespace, head].join("::") } + [head]
                  end
        lexical.find { |candidate| @constants.include?(candidate) && !seen.include?(candidate) }
      end

      def resolved(reference, seen)
        found = lexical_of(reference, seen)
        reference["path"].drop(1).reduce(found && followed(found, seen)) do |outer, segment|
          full = "#{outer}::#{segment}"
          !outer.nil? && @constants.include?(full) ? followed(full, seen) : nil
        end
      end

      # A Zeitwerk name can also be an alias, so a broken alias can still resolve as a name.
      def broken?(name, seen)
        target = @targets[name]
        return false if target.nil?

        seen.include?(name) || resolved(target, seen | [name]).nil?
      end

      # The first alias on the path of a reference whose target does not resolve, if any.
      def broken_alias_of(reference, seen)
        name = lexical_of(reference, seen)
        reference["path"].drop(1).each do |segment|
          return nil if name.nil?
          return name if broken?(name, seen)

          outer = followed(name, seen)
          name = !outer.nil? && @constants.include?("#{outer}::#{segment}") ? "#{outer}::#{segment}" : nil
        end
        !name.nil? && broken?(name, seen) ? name : nil
      end

      def library_in?(reference, seen)
        broken = broken_alias_of(reference, seen)
        target = broken && @targets[broken]
        return library_in?(target, seen | [broken]) if broken && target && !seen.include?(broken)

        first = lexical_of(reference, seen)
        first_constant = first && followed(first, seen)
        return false if first_constant && @declared.include?(first_constant)

        head = reference["path"].first
        !head.nil? && !@segments.include?(head)
      end
    end
  end
end
