# frozen_string_literal: true

require "open3"
require "set"
require_relative "../scope"

module CallmapRb
  module Extractor
    # Every Ruby file of the repo, and each `.gemspec`, whose folder is a load unit of its own.
    RubyTree = Struct.new(:files, :gemspecs, keyword_init: true)

    # The walk of the files of a repo, as ADR-0035 records.
    module Walk
      module_function

      # The untracked paths that git ignores, by repo-relative path. A repo that is not a git repo
      # ignores nothing. An ignored folder can hold the data of a container that another user owns,
      # so the walk must not open it.
      def ignored_paths_of(repo)
        listed, _, status = Open3.capture3(
          "git", "ls-files", "--others", "--ignored", "--exclude-standard", "--directory", "-z",
          chdir: repo
        )
        return Set.new unless status.success?

        listed.split("\0").reject(&:empty?).map { |path| path.delete_suffix("/") }.to_set
      rescue SystemCallError
        Set.new
      end

      def entries_of(repo, directory)
        Dir.children(directory.empty? ? repo : File.join(repo, directory))
      rescue Errno::EACCES, Errno::EPERM
        raise if directory.empty?

        []
      end

      # Every Ruby file of the repo by repo-relative path, in path order, whatever the scope, because
      # a class takes its methods from every body in its load unit. The walk does not enter a path
      # that git ignores, or a folder below the root that it cannot read. A symbolic link is not
      # followed.
      def ruby_tree_of(repo)
        ignored = ignored_paths_of(repo)
        files = []
        gemspecs = []
        walk = lambda do |directory|
          entries_of(repo, directory).each do |name|
            next if Scope.skipped_directory?(name)

            path = directory.empty? ? name : "#{directory}/#{name}"
            next if ignored.include?(path)

            stat = File.lstat(File.join(repo, path))
            if stat.directory? then walk.call(path)
            elsif stat.file? && name.end_with?(".rb") then files << path
            elsif stat.file? && name.end_with?(".gemspec") then gemspecs << path
            end
          end
        end
        walk.call("")
        RubyTree.new(files: files.sort, gemspecs: gemspecs.sort)
      end
    end
  end
end
