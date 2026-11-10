# frozen_string_literal: true

require "fileutils"
require "tmpdir"
require_relative "base_cache"
require_relative "extractor/extract"
require_relative "git"
require_relative "languages"
require_relative "review_input"
require_relative "scope"

module CallmapRb
  # The review of a branch: the graph documents of the Ruby files of the base and of the branch,
  # the sources and the facts from git, written into the reader page.
  module Review
    # A failed read of a graph document, with the message that the command prints.
    class UnreadableGraph < StandardError; end

    Finished = Struct.new(:out, :notes, keyword_init: true)

    module_function

    def base_of(root, typed)
      return { name: typed, commit: Git.commit_of(root, typed) } unless typed.nil?

      name = Git.default_branch_of(root)
      { name: name, commit: Git.merge_base_of(root, name) }
    end

    def default_out_of(root)
      File.join(Dir.tmpdir, "callmap", "review-#{File.basename(root)}.html")
    end

    def unparsed_note_of(path)
      "#{COMMAND} read no functions in #{path}, because Ripper could not parse it."
    end

    # The reason names a repo-relative path, so the path of the read folder goes from it.
    def graph_document_of(what, path, scope, notes)
      read = Extractor.read_ruby(path, scope)
      read.unparsed.each { |file| notes << unparsed_note_of(file) }
      read.document
    rescue SystemCallError, IOError => error
      raise UnreadableGraph, "#{what} could not be read: #{error.message.gsub("#{path}/", "")}"
    end

    def base_document_of(root, base, scope, cache, notes)
      short = Git.short_commit_of(root, base[:commit])
      read_base = lambda do
        Git.in_worktree_at(root, base[:commit]) { |path| graph_document_of("the base #{short}", path, scope, notes) }
      end
      return read_base.call unless cache

      BaseCache.through(repo: Git.common_dir_of(root), commit: base[:commit], scope: scope, &read_base)
    end

    # The base source of each file that git lists as changed and that the base graph document holds,
    # as ADR-0038 records.
    def sources_of(root, commit, branch, base)
      branch_files = branch.flat_map { |document| document["files"] }.uniq
      base_files = base.flat_map { |document| document["files"] }
      {
        "branch" => branch_files.to_h { |file| [file, File.read(File.join(root, file), encoding: Encoding::UTF_8).scrub] },
        "base" => Git.changed_files_of(root, commit).select { |file| base_files.include?(file) }
                     .to_h { |file| [file, Git.file_at(root, commit, file).scrub] }
      }
    end

    def checkout_of(root, base, scope)
      {
        "branch" => Git.branch_name_of(root),
        "baseName" => base[:name],
        "baseCommit" => Git.short_commit_of(root, base[:commit]),
        "headCommit" => Git.short_commit_of(root, "HEAD"),
        "uncommitted" => Git.uncommitted_files_of(root).any? { |path| Languages.in_review_scope?(path, scope) }
      }
    end

    def run(read)
      root = Git.repo_root_of(File.expand_path(read.repo))
      base = base_of(root, read.base)
      scope = Scope.effective(read.scope, read.tests)
      files = Git.working_tree_files_of(root) + Git.files_at_commit(root, base[:commit])
      in_scope = files.select { |path| Languages.in_review_scope?(path, scope) }

      notes = []
      base_documents = []
      branch_documents = []
      if in_scope.any? { |path| Languages.ruby_file?(path) }
        branch_documents << graph_document_of("the branch", root, scope, notes)
        base_documents << base_document_of(root, base, scope, read.cache, notes)
      end
      input = {
        "formatVersion" => ReviewInput::FORMAT_VERSION,
        "base" => base_documents,
        "branch" => branch_documents,
        "packedSources" => ReviewInput.packed_sources_of(sources_of(root, base[:commit], branch_documents, base_documents)),
        "checkout" => checkout_of(root, base, scope),
        "editor" => { "name" => read.editor, "repoRoot" => root }
      }
      page = ReviewInput.reader_page_of(input)

      out = File.expand_path(read.out || default_out_of(root))
      FileUtils.mkdir_p(File.dirname(out))
      File.write(out, page)
      Finished.new(out: out, notes: Languages.other_language_lines_of(in_scope, files) + notes.uniq)
    end
  end
end
