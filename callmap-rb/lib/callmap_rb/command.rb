# frozen_string_literal: true

require "rbconfig"
require_relative "arguments"
require_relative "git"
require_relative "review"

module CallmapRb
  # callmap-rb reads the Ruby files of a branch and of its base, and writes the reader page of the
  # review. docs/command-contract.md at the root of the repo gives its command and its flags.
  module Command
    module_function

    def opener_of(target)
      case RbConfig::CONFIG["host_os"]
      when /darwin/ then ["open", target]
      when /mswin|mingw|cygwin/ then ["rundll32", "url.dll,FileProtocolHandler", target]
      else ["xdg-open", target]
      end
    end

    # A page that does not open is still written, and the command prints its path.
    def open_in_browser(target)
      Process.detach(Process.spawn(*opener_of(target), %i[out err] => File::NULL))
    rescue SystemCallError
      nil
    end

    def run(args)
      read = Arguments.read(args, Dir.pwd)
      finished = Review.run(read)
      open_in_browser(finished.out) if read.open
      finished.notes.each { |note| warn note }
      puts finished.out
      0
    rescue Arguments::Error, Git::Error, Review::UnreadableGraph, ReviewInput::MissingPageTemplate => error
      warn error.message
      1
    end
  end
end
