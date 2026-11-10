# frozen_string_literal: true

module CallmapRb
  module Extractor
    # The methods that a macro of Ruby or Rails makes in a class body. They are methods of the
    # library, so a call to one is a library call (ADR-0027), even when a `def` elsewhere has its
    # name.
    module Macros
      ASSOCIATION_NAMES = [
        "%s", "%s=", "build_%s", "create_%s", "create_%s!", "reload_%s", "reset_%s", "%s_changed?",
        "%s_previously_changed?"
      ].freeze

      # The names that one macro makes, and the side of the class that holds them.
      MadeNames = Struct.new(:side, :names)

      module_function

      def made_names_of(macro)
        side = macro["singleton"] || macro["name"] == "scope" ? :singleton : :instance
        MadeNames.new(side, macro["symbols"].flat_map { |name| names_of(macro, name) })
      end

      def singular_of(name)
        return "#{name.delete_suffix("ies")}y" if name.end_with?("ies")

        name.delete_suffix("s")
      end

      def prefixed(macro, name)
        prefix = macro["options"]["prefix"]
        to = macro["options"]["to"]
        return "#{to}_#{name}" if prefix == true && to.is_a?(String)

        prefix.is_a?(String) ? "#{prefix}_#{name}" : name
      end

      def names_of(macro, name)
        case macro["name"]
        when "attr_writer" then ["#{name}="]
        when "attr_accessor" then [name, "#{name}="]
        when "delegate" then [prefixed(macro, name)]
        when "has_many", "has_and_belongs_to_many"
          [name, "#{name}=", "#{singular_of(name)}_ids", "#{singular_of(name)}_ids="]
        when "has_one", "belongs_to" then ASSOCIATION_NAMES.map { |pattern| format(pattern, name) }
        else [name]
        end
      end
    end
  end
end
