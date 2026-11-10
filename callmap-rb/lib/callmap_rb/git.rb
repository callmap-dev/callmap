# frozen_string_literal: true

require "open3"
require "tmpdir"

module CallmapRb
  # The reads of git that a review needs, as docs/command-contract.md gives them.
  module Git
    # A failed read of git, with the message that the command prints.
    class Error < StandardError; end

    # git grows the length of --short with the object count, so 2 clones of the same commits can
    # differ.
    SHORT_COMMIT_LENGTH = 7

    STATUS_CODE_LENGTH = "XY ".length

    REMOTE_HEAD = %r{\Arefs/remotes/(.+)/HEAD\z}

    module_function

    def run(dir, *args)
      out, _, status = Open3.capture3("git", *args, chdir: dir, stdin_data: "", binmode: true)
      [out.force_encoding(Encoding::UTF_8), status.success?]
    rescue SystemCallError => error
      raise Error, "git could not be started: #{error.message}"
    end

    def trimmed_or(message, dir, *args)
      out, succeeded = run(dir, *args)
      raise Error, message unless succeeded

      out.strip
    end

    def trimmed(dir, *args)
      trimmed_or("git #{args.first} failed in #{dir}", dir, *args)
    end

    def succeeds?(dir, *args)
      run(dir, *args)[1]
    end

    def paths(dir, *args)
      out, succeeded = run(dir, *args)
      raise Error, "git #{args.first} failed in #{dir}" unless succeeded

      out.split("\0").reject(&:empty?)
    end

    def repo_root_of(path)
      raise Error, "#{path} is not inside a git repo" unless File.directory?(path)

      trimmed_or("#{path} is not inside a git repo", path, "rev-parse", "--show-toplevel")
    end

    def common_dir_of(root)
      File.realpath(trimmed(root, "rev-parse", "--path-format=absolute", "--git-common-dir"))
    end

    def remote_heads_of(root)
      refs = trimmed(root, "for-each-ref", "--format=%(refname)", "refs/remotes/").split("\n")
      heads = refs.filter_map { |ref| (head = REMOTE_HEAD.match(ref)) && [ref, head[1]] }
      origin, others = heads.partition { |_, remote| remote == "origin" }
      (origin + others).map(&:first).select { |head| succeeds?(root, "symbolic-ref", "--quiet", head) }
    end

    def default_branch_of(root)
      head = remote_heads_of(root).first
      return trimmed(root, "symbolic-ref", "--quiet", "--short", head) unless head.nil?

      found = %w[main master].find { |branch| succeeds?(root, "rev-parse", "--verify", "--quiet", "refs/heads/#{branch}") }
      return found unless found.nil?

      raise Error, "#{root} has no remote head, no main and no master to find a base on. Name one with --base."
    end

    def merge_base_of(root, branch)
      trimmed_or("HEAD shares no commit with #{branch} in #{root}", root, "merge-base", "HEAD", branch)
    end

    def commit_of(root, revision)
      trimmed_or("the base '#{revision}' is not a commit in #{root}", root, "rev-parse", "--verify", "--quiet", "#{revision}^{commit}")
    end

    def branch_name_of(root)
      return nil unless succeeds?(root, "symbolic-ref", "--quiet", "HEAD")

      out, succeeded = run(root, "symbolic-ref", "--quiet", "--short", "HEAD")
      succeeded ? out.strip : nil
    end

    def short_commit_of(root, commit)
      trimmed(root, "rev-parse", "--short=#{SHORT_COMMIT_LENGTH}", commit)
    end

    def working_tree_files_of(root)
      paths(root, "ls-files", "--cached", "--others", "--exclude-standard", "-z")
    end

    def uncommitted_files_of(root)
      paths(root, "--no-optional-locks", "status", "--porcelain=v1", "-z", "--no-renames", "--untracked-files=all")
        .map { |entry| entry[STATUS_CODE_LENGTH..] }
    end

    def changed_files_of(root, commit)
      paths(root, "diff", "--name-only", "--no-renames", "-z", commit)
    end

    def files_at_commit(root, commit)
      paths(root, "ls-tree", "-r", "--name-only", "-z", commit)
    end

    def file_at(root, commit, file)
      out, succeeded = run(root, "show", "#{commit}:#{file}")
      raise Error, "git show failed for #{file} at #{commit}" unless succeeded

      out
    end

    # Reads the base in a temporary git worktree at the commit, and removes the worktree after the
    # read, also when the read fails.
    def in_worktree_at(root, commit)
      Dir.mktmpdir("#{COMMAND}-base-") do |parent|
        path = File.join(parent, "base")
        trimmed(root, "worktree", "add", "--detach", "--quiet", path, commit)
        begin
          yield path
        ensure
          run(root, "worktree", "remove", "--force", path)
        end
      end
    end
  end
end
