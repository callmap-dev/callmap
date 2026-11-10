# frozen_string_literal: true

module CallmapRb
  module Extractor
    # Zeitwerk's naming rule: in a Rails app, a file under an autoload root names one constant by its
    # path, so Zeitwerk naming decides which constants an app has (ADR-0030). A constant can exist
    # with no body, such as `Point = Struct.new(:x)` in `app/models/point.rb`, or a namespace made
    # from a directory.
    module Zeitwerk
      APP_MARKER = "config/application.rb"

      INFLECTION_FILES = ["config/initializers/inflections.rb", "config/initializers/zeitwerk.rb", APP_MARKER].freeze

      # The directories under `app/` that Rails leaves out of its autoload roots.
      NOT_AUTOLOADED = %w[assets javascript views].freeze

      # Directories below an autoload root that are autoload roots of their own, so a concern in
      # `app/models/concerns/billable.rb` is `Billable` and not `Concerns::Billable`.
      NESTED_ROOTS = %w[app/models/concerns app/controllers/concerns].freeze

      AUTOLOADS_LIB = /\bautoload_lib\b|\b(?:autoload|eager_load)_paths\b[^\n]*\blib\b/

      ACRONYM = /\bacronym\s*\(?\s*["']([^"']+)["']/
      INFLECT = /\binflect\s*\(([^)]*)\)/
      INFLECTED_PAIR = /["']([^"']+)["']\s*=>\s*["']([^"']+)["']/
      PATH_GEM = /^\s*gem\s+["'][^"'\n]+["'][^\n]*?(?:\bpath:|:path\s*=>)\s*["']([^"'\n]+)["']/

      Inflections = Struct.new(:acronyms, :overrides, keyword_init: true)

      module_function

      def prefix_of(directory)
        directory.empty? ? "" : "#{directory}/"
      end

      def text_of(repo, path)
        file = File.join(repo, path)
        File.file?(file) ? File.read(file, encoding: Encoding::UTF_8).scrub : ""
      end

      # The path as posix.normalize gives it, for a relative path.
      def normalized(path)
        segments = path.split("/").each_with_object([]) do |segment, kept|
          next if segment.empty? || segment == "."

          if segment == ".." && !kept.empty? && kept.last != ".." then kept.pop
          else kept << segment
          end
        end
        segments.empty? ? "." : segments.join("/")
      end

      # The folder of each Rails app of the repo, '' for an app at the root.
      def rails_apps_of(files)
        files.select { |path| path == APP_MARKER || path.end_with?("/#{APP_MARKER}") }
             .map { |path| path[0...-APP_MARKER.length].delete_suffix("/") }
      end

      # The folders of the gems that the Gemfile of an app names by a path inside the repo.
      def engines_of(repo, app)
        text_of(repo, "#{prefix_of(app)}Gemfile").scan(PATH_GEM)
          .map { |(path)| normalized([app, path].reject(&:empty?).join("/")).delete_suffix("/") }
          .reject { |engine| engine.start_with?("..") }
      end

      def inflections_of(text)
        Inflections.new(
          acronyms: text.scan(ACRONYM).to_h { |(acronym)| [acronym.downcase, acronym] },
          overrides: text.scan(INFLECT).flat_map { |(pairs)| pairs.scan(INFLECTED_PAIR) }.to_h
        )
      end

      def camelize(segment, inflections)
        inflections.overrides.fetch(segment) do
          segment.split("_", -1).map do |word|
            inflections.acronyms.fetch(word) { word[0].to_s.upcase + word[1..].to_s }
          end.join
        end
      end

      # Every directory directly under `app/` of an app or an engine that holds a Ruby file.
      def app_roots_of(directory, files)
        prefix = "#{prefix_of(directory)}app/"
        roots = []
        files.each do |path|
          next unless path.start_with?(prefix)

          rest = path[prefix.length..]
          slash = rest.index("/")
          next if slash.nil? || NOT_AUTOLOADED.include?(rest[0...slash])

          roots << (prefix + rest[0...slash])
          NESTED_ROOTS.each do |nested|
            root = "#{prefix_of(directory)}#{nested}"
            roots << root if path.start_with?("#{root}/")
          end
        end
        roots.uniq
      end

      # The constants that the loader of one app names: each file under an autoload root, and each
      # namespace on the way. The roots are `app/*` of the app and of its engines, and `lib` when the
      # app autoloads it. A file belongs to the deepest root that holds it.
      def zeitwerk_names_of(repo, app, engines, files)
        inflections = inflections_of(INFLECTION_FILES.map { |path| text_of(repo, "#{prefix_of(app)}#{path}") }.join("\n"))
        roots = [app, *engines].flat_map { |directory| app_roots_of(directory, files) }
        roots << "#{prefix_of(app)}lib" if AUTOLOADS_LIB.match?(text_of(repo, "#{prefix_of(app)}#{APP_MARKER}"))

        names = []
        files.each do |path|
          root = roots.select { |directory| path.start_with?("#{directory}/") }.max_by(&:length)
          next if root.nil?

          segments = path[(root.length + 1)...-".rb".length].split("/").map { |segment| camelize(segment, inflections) }
          (1..segments.length).each { |depth| names << segments.take(depth).join("::") }
        end
        names.uniq
      end
    end
  end
end
