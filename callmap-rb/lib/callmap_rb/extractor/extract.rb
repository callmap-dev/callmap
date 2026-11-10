# frozen_string_literal: true

require "set"
require_relative "../ripper/read"
require_relative "../scope"
require_relative "../version"
require_relative "class_chain"
require_relative "constants"
require_relative "load_units"
require_relative "walk"

module CallmapRb
  # The Ruby extractor of callmap-rb: it reads a repo and emits the graph document that the core
  # owns the contract for (ADR-0009). Ruby has no type checker, so the rules of Callmap tie each
  # call, and a call that they do not prove is an open end (ADR-0027).
  module Extractor
    LANGUAGE = "ruby"

    CHECKER = "Callmap Ruby rules"

    # The graph document, and the files in scope that Ripper could not parse, which the document
    # claims with no function.
    Read = Struct.new(:document, :unparsed, keyword_init: true)

    module_function

    def name_of(method)
      return method["name"] if method["owner"].empty?

      "#{method["owner"]}#{method["singleton"] ? "." : "#"}#{method["name"]}"
    end

    # Each method of a file with the full name of its owner, its file and its id. A repeated name of
    # one file takes the suffix `~n` in source order.
    def indexed_methods_of(path, written_methods, owner_of)
      seen = Hash.new(0)
      written_methods.map do |written|
        method = written.merge("owner" => owner_of.call(path, written))
        name = name_of(method)
        seen[name] += 1
        method.merge("file" => path, "id" => seen[name] == 1 ? "#{path}##{name}" : "#{path}##{name}~#{seen[name]}")
      end
    end

    # Every Ruby file of the repo is read, in scope or not, because a call on a constant ties through
    # every body of its class. A callee outside the scope is then a library call.
    def read_ruby(repo, scope)
      tree = Walk.ruby_tree_of(repo)
      files = tree.files.select { |path| Scope.in_scope?(path, scope) }
      reads = tree.files.to_h { |path| [path, read_ruby_file(repo, path)] }
      parsed = reads.select { |_, read| read["parsed"] }

      unit_of = LoadUnits.load_units_of(repo, tree)
      bodies_of = ->(unit) { unit.files.flat_map { |path| parsed.dig(path, "bodies") || [] } }
      aliases_of = ->(unit) { unit.files.flat_map { |path| parsed.dig(path, "aliases") || [] } }
      constants_in = {}.compare_by_identity
      owner_of = lambda do |path, written|
        reference = written["ownerReference"]
        next written["owner"] if reference.nil?

        unit = unit_of.call(path)
        constants = constants_in[unit] ||= Constants.new(bodies_of.call(unit), unit.names, aliases_of.call(unit))
        constants.constant_of(reference) || written["owner"]
      end

      methods_of_file = parsed.to_h { |path, read| [path, indexed_methods_of(path, read["methods"], owner_of)] }
      claimed = files.to_set
      defined_names = methods_of_file.values.flatten.to_set { |method| method["name"] }
      chains = {}.compare_by_identity
      chain_in = lambda do |unit|
        chains[unit] ||= ClassChain.new(
          bodies: bodies_of.call(unit),
          methods: unit.files.flat_map { |path| methods_of_file[path] || [] },
          names: unit.names,
          aliases: aliases_of.call(unit),
          defined_names: defined_names,
          claimed: claimed
        )
      end

      functions = []
      calls = []
      open_ends = []
      files.each do |path|
        indexed = methods_of_file[path] || []
        indexed.each do |method|
          functions << {
            "id" => method["id"], "name" => name_of(method), "file" => path,
            "firstLine" => method["firstLine"], "lastLine" => method["lastLine"], "sourceHash" => method["sourceHash"]
          }
        end
        next unless parsed.key?(path)

        chain = chain_in.call(unit_of.call(path))
        parsed[path]["calls"].each do |site|
          caller = indexed[site["method"]]
          next if caller.nil?

          kind, value = chain.resolution_of(site, caller)
          case kind
          when :call
            calls << { "caller" => caller["id"], "callee" => value, "line" => site["line"] }
          when :one_of
            group = "#{path}:#{site["line"]}:#{site["column"]}"
            value.each { |callee| calls << { "caller" => caller["id"], "callee" => callee, "line" => site["line"], "group" => group } }
          when :open_end
            open_ends << { "caller" => caller["id"], "line" => site["line"], "expression" => site["expression"], "reason" => value }
          end
        end
      end

      document = {
        "language" => LANGUAGE,
        "checker" => { "name" => CHECKER, "version" => "callmap-rb #{VERSION}, #{RUBY_DESCRIPTION}" },
        "scope" => scope,
        "files" => files,
        "functions" => functions,
        "calls" => calls,
        "openEnds" => open_ends
      }
      Read.new(document: document, unparsed: files.reject { |path| parsed.key?(path) })
    end
  end
end
