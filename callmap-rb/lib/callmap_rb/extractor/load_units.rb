# frozen_string_literal: true

require_relative "zeitwerk"

module CallmapRb
  module Extractor
    # The load units of a repo (ADR-0030): the Ruby code that loads together, so that its constants
    # share one set of names. A load unit is one Rails app, the folder of one `.gemspec`, or else the
    # rest of the repo.
    module LoadUnits
      # The files whose bodies and methods the unit indexes, and the constants that exist in the unit
      # with no body of their own.
      LoadUnit = Struct.new(:files, :names, keyword_init: true)

      Root = Struct.new(:directory, :rails, :files, keyword_init: true)

      module_function

      def directory_of(path)
        slash = path.rindex("/")
        slash.nil? ? "" : path[0...slash]
      end

      def holds?(directory, path)
        directory.empty? || path.start_with?("#{directory}/")
      end

      # Each file belongs to the deepest app or gem folder that holds it, so a gem inside an app is a
      # unit of its own. An app wins over a gem of the same folder. An app also indexes the files of
      # each engine that its Gemfile names by a path, because the engine loads into the app.
      def load_units_of(repo, tree)
        roots = {}
        Zeitwerk.rails_apps_of(tree.files).each do |directory|
          roots[directory] = Root.new(directory: directory, rails: true, files: [])
        end
        tree.gemspecs.map { |path| directory_of(path) }.each do |directory|
          roots[directory] ||= Root.new(directory: directory, rails: false, files: [])
        end
        rest = Root.new(directory: "", rails: false, files: [])

        homes = {}
        tree.files.each do |path|
          root = roots.values.select { |each| holds?(each.directory, path) }.max_by { |each| each.directory.length } || rest
          root.files << path
          homes[path] = root
        end

        unit_of = lambda do |root|
          next LoadUnit.new(files: root.files, names: []) unless root.rails

          engines = Zeitwerk.engines_of(repo, root.directory)
          files = root.files + tree.files.select do |path|
            !homes[path].equal?(root) && engines.any? { |engine| holds?(engine, path) }
          end
          LoadUnit.new(files: files, names: Zeitwerk.zeitwerk_names_of(repo, root.directory, engines, files))
        end

        units = {}.compare_by_identity
        lambda do |path|
          root = homes.fetch(path, rest)
          units[root] ||= unit_of.call(root)
        end
      end
    end
  end
end
