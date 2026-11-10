# frozen_string_literal: true

require "fileutils"
require_relative "lib/callmap_rb/version"

# The gem build copies the page template from the build of the same commit, and the test globs and
# the license from the core, as ADR-0040 records. So run `npm run build` before `gem build`.
core = File.expand_path("..", __dir__)
copies = {
  "packages/cli/dist/page-template.html" => "page-template.html",
  "packages/scope/test-globs.json" => "test-globs.json",
  "LICENSE" => "LICENSE"
}
copies.each do |source, copy|
  from = File.join(core, source)
  unless File.file?(from)
    raise "the gem build copies #{source}, which is missing. Run npm run build at the root of the repo first."
  end

  FileUtils.cp(from, File.join(__dir__, copy))
end

Gem::Specification.new do |spec|
  spec.name = "callmap-rb"
  spec.version = CallmapRb::VERSION
  spec.summary = "Callmap for Ruby: a call graph reader for an engineer who still reads code."
  spec.description = "callmap-rb reads the Ruby files of a branch and of its base, and writes the reader page of the review."
  spec.authors = ["Callmap"]
  spec.homepage = "https://github.com/callmap-dev/callmap/tree/master/callmap-rb"
  spec.license = "MIT"
  spec.required_ruby_version = ">= 3.1"
  spec.metadata = { "source_code_uri" => "https://github.com/callmap-dev/callmap" }
  spec.files = [*Dir.glob("lib/**/*.rb", base: __dir__), "exe/callmap-rb", *copies.values, "README.md"]
  spec.bindir = "exe"
  spec.executables = ["callmap-rb"]
end
