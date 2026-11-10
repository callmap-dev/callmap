# frozen_string_literal: true

module CallmapRb
  COMMAND = "callmap-rb"

  # The arguments of `callmap-rb review`, as docs/command-contract.md gives them.
  module Arguments
    EDITOR_NAMES = %w[vscode jetbrains].freeze

    USAGE = "usage: #{COMMAND} review [<repo>] [--base <commit>] [--scope <glob>]... [--out <file>] " \
            "[--no-open] [--no-cache] [--editor #{EDITOR_NAMES.join("|")}] [--tests]"

    VALUE_FLAGS = %w[--base --scope --out --editor].freeze

    # A refusal of the arguments, which the command prints as it is.
    class Error < StandardError; end

    Invocation = Struct.new(:repo, :base, :scope, :out, :open, :cache, :editor, :tests, keyword_init: true)

    module_function

    def read(args, cwd)
      raise Error, USAGE unless args.first == "review"

      read = Invocation.new(scope: [], open: true, cache: true, editor: "vscode", tests: false)
      rest = args.drop(1)
      index = 0
      while index < rest.length
        argument = rest[index]
        case argument
        when "--no-open" then read.open = false
        when "--no-cache" then read.cache = false
        when "--tests" then read.tests = true
        when *VALUE_FLAGS
          value = rest[index + 1]
          raise Error, "#{argument} needs a value after it" if value.nil? || value.start_with?("--")

          read_value(read, argument, value)
          index += 1
        else
          raise Error, "#{argument} is not a flag #{COMMAND} review knows" if argument.start_with?("--")
          raise Error, "'#{argument}' follows no flag. Callmap reviews one repo at a time." unless read.repo.nil?

          read.repo = argument
        end
        index += 1
      end
      read.repo ||= cwd
      read
    end

    def read_value(read, flag, value)
      case flag
      when "--base" then read.base = value
      when "--scope" then read.scope << value
      when "--out" then read.out = value
      else
        raise Error, "--editor needs one of #{EDITOR_NAMES.join(", ")} after it" unless EDITOR_NAMES.include?(value)

        read.editor = value
      end
    end
  end
end
