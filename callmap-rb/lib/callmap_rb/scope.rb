# frozen_string_literal: true

require "json"

module CallmapRb
  # A scope glob as every distribution of Callmap reads it, as docs/command-contract.md gives it:
  # `*` inside one segment, `**` across segments, `?` for one character inside a segment, everything
  # else literal, whole path only. A glob that starts with `!` leaves out the files it matches.
  module Scope
    NEGATION = "!"

    # The gem build copies packages/scope/test-globs.json beside the gem.
    TEST_GLOBS_FILE = File.expand_path("../../test-globs.json", __dir__)

    SKIPPED_NAMES = %w[node_modules vendor].freeze

    module_function

    # The folders that no walk of a review enters, as packages/scope/src/skipped.ts lists them.
    def skipped_directory?(name)
      SKIPPED_NAMES.include?(name) || name.start_with?(".")
    end

    def segment_pattern(segment)
      Regexp.escape(segment).gsub("\\?", "[^/]").gsub("\\*", "[^/]*")
    end

    def glob_pattern(glob)
      segments = glob.split("/", -1)
      segments.each_with_index.map do |segment, index|
        last = index == segments.length - 1
        if segment == "**"
          last ? ".*" : "(?:[^/]+/)*"
        else
          last ? segment_pattern(segment) : "#{segment_pattern(segment)}/"
        end
      end.join
    end

    def matches?(path, glob)
      /\A#{glob_pattern(glob)}\z/.match?(path)
    end

    # Whether a repo-relative path is in scope. An empty scope narrows nothing.
    def in_scope?(path, scope)
      taken = scope.reject { |glob| glob.start_with?(NEGATION) }
      left_out = scope.select { |glob| glob.start_with?(NEGATION) }.map { |glob| glob.delete_prefix(NEGATION) }
      (taken.empty? || taken.any? { |glob| matches?(path, glob) }) &&
        left_out.none? { |glob| matches?(path, glob) }
    end

    def test_globs
      @test_globs ||= JSON.parse(File.read(TEST_GLOBS_FILE)).values.flatten.uniq
    end

    # The globs of the user, then each test glob as a `!` glob, unless the user asks for the tests. A
    # negated glob that the user already typed does not repeat.
    def effective(scope, tests)
      return scope if tests

      scope + test_globs.map { |glob| "#{NEGATION}#{glob}" }.reject { |glob| scope.include?(glob) }
    end
  end
end
