# frozen_string_literal: true

require "digest"
require "fileutils"
require "json"

module CallmapRb
  # The base cache of callmap-rb, as docs/command-contract.md gives it. Ruby has no dependency file,
  # because its rules read only the source of the repo and load no gem. So the key of an entry holds
  # the commit, the effective scope and the version of the distribution.
  module BaseCache
    ENTRIES_FOR_EACH_REPO = 20

    DOCUMENT_FIELDS = %w[language checker scope files functions calls openEnds].freeze

    LIB = File.expand_path("..", __dir__)

    module_function

    def cache_folder
      home = ENV.fetch("XDG_CACHE_HOME", "")
      return File.join(home, COMMAND) if home.start_with?("/")

      File.join(Dir.home, ".cache", COMMAND)
    end

    # The version of callmap-rb is the hash of its own files and of the ruby that runs it, because
    # Ripper reads each file as that ruby reads it. So a change to a rule keys its own entries.
    def distribution_version
      @distribution_version ||= begin
        hash = Digest::SHA256.new
        hash << "#{RUBY_DESCRIPTION}\0"
        Dir.glob("**/*.rb", base: LIB).sort.each do |path|
          hash << "#{path}\0" << File.binread(File.join(LIB, path)) << "\0"
        end
        hash.hexdigest
      end
    end

    def entry_name_of(commit, scope)
      Digest::SHA256.hexdigest(JSON.generate(["ruby", commit, scope, distribution_version]))
    end

    def document?(value)
      value.is_a?(Hash) && value.keys.sort == DOCUMENT_FIELDS.sort && value["language"] == Extractor::LANGUAGE
    end

    def cached_at(entry)
      cached = JSON.parse(File.read(entry))
      return nil unless document?(cached)

      now = Time.now
      File.utime(now, now, entry)
      cached
    rescue SystemCallError, JSON::ParserError
      nil
    end

    def keep_newest(folder)
      stored = Dir.glob("*.json", base: folder).map { |name| File.join(folder, name) }
      aged = stored.filter_map do |path|
        [path, File.mtime(path)]
      rescue SystemCallError
        nil
      end
      aged.sort_by { |path, time| [-time.to_r, path] }.drop(ENTRIES_FOR_EACH_REPO).each do |path, _|
        FileUtils.rm_f(path)
      end
    end

    # A failed write is not an error, so the review goes on without the entry.
    def store(folder, entry, document)
      FileUtils.mkdir_p(folder)
      partial = "#{entry}.#{Process.pid}.partial"
      File.write(partial, JSON.generate(document))
      File.rename(partial, entry)
      keep_newest(folder)
    rescue SystemCallError
      FileUtils.rm_f(partial) if partial
    end

    # The graph document of the base from the cache, or from the read, which the cache then keeps.
    # The folder of a repo is named for the git common folder, so the worktrees of one repo share
    # their entries.
    def through(repo:, commit:, scope:)
      folder = File.join(cache_folder, Digest::SHA256.hexdigest(repo))
      entry = File.join(folder, "#{entry_name_of(commit, scope)}.json")
      cached = cached_at(entry)
      return cached unless cached.nil?

      document = yield
      store(folder, entry, document)
      document
    end
  end
end
