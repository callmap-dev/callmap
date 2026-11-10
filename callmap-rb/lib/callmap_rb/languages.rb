# frozen_string_literal: true

require_relative "scope"

module CallmapRb
  # The files of each language, as docs/command-contract.md gives them.
  module Languages
    OtherLanguage = Struct.new(:name, :distribution, :claims, keyword_init: true)

    TYPESCRIPT_FILE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)\z/

    module_function

    def folder_of(path)
      slash = path.rindex("/")
      slash.nil? ? "" : path[0...slash]
    end

    def in_review_scope?(path, scope)
      path.split("/")[0...-1].none? { |folder| Scope.skipped_directory?(folder) } && Scope.in_scope?(path, scope)
    end

    def ruby_file?(path)
      path.end_with?(".rb")
    end

    # The folders that the Go walk skips, as callmap-go/internal/extractor/walk.go names them.
    def go_skips_folder?(name)
      %w[vendor testdata node_modules].include?(name) || name.start_with?(".", "_")
    end

    def go_files?(in_scope, files)
      module_folders = files.select { |path| path == "go.mod" || path.end_with?("/go.mod") }.map { |path| folder_of(path) }
      in_scope.any? do |path|
        folders = path.split("/")[0...-1]
        path.end_with?(".go") && folders.none? { |folder| go_skips_folder?(folder) } &&
          (module_folders.include?("") || folders.each_index.any? { |index| module_folders.include?(folders[0..index].join("/")) })
      end
    end

    OTHER_LANGUAGES = [
      OtherLanguage.new(name: "TypeScript", distribution: "callmap-ts",
                        claims: ->(in_scope, _) { in_scope.any? { |path| TYPESCRIPT_FILE.match?(path) } }),
      OtherLanguage.new(name: "Go", distribution: "callmap-go", claims: method(:go_files?))
    ].freeze

    def other_language_lines_of(in_scope, files)
      OTHER_LANGUAGES.select { |other| other.claims.call(in_scope, files) }.map do |other|
        "#{COMMAND} read only the Ruby files. Run #{other.distribution} review for the #{other.name} files."
      end
    end
  end
end
