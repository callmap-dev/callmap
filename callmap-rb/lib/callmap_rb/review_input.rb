# frozen_string_literal: true

require "json"
require "zlib"

module CallmapRb
  # The review input in the data block of the reader page, as docs/command-contract.md gives it.
  module ReviewInput
    FORMAT_VERSION = 1

    # The gem build copies the page template of the build of the same commit beside the gem.
    PAGE_TEMPLATE = File.expand_path("../../page-template.html", __dir__)

    DATA_BLOCK_START = '<script type="application/json" id="reader-page-data">'

    TEMPLATE_DATA_BLOCK = "#{DATA_BLOCK_START}{{CALLMAP_REVIEW_INPUT}}</script>".freeze

    # A page template that the gem does not hold, as in a checkout before the gem build.
    class MissingPageTemplate < StandardError; end

    module_function

    # A raw deflate stream in a gzip wrapper writes no time in its header, so the same sources give
    # the same bytes.
    def packed_sources_of(sources)
      deflate = Zlib::Deflate.new(Zlib::DEFAULT_COMPRESSION, Zlib::MAX_WBITS + 16)
      packed = deflate.deflate(JSON.generate(sources), Zlib::FINISH)
      deflate.close
      [packed].pack("m0")
    end

    def reader_page_of(input)
      unless File.file?(PAGE_TEMPLATE)
        raise MissingPageTemplate, "#{COMMAND} holds no page template at #{PAGE_TEMPLATE}. The gem build copies it."
      end

      template = File.read(PAGE_TEMPLATE, encoding: Encoding::UTF_8)
      parts = template.split(TEMPLATE_DATA_BLOCK, -1)
      unless parts.length == 2
        raise MissingPageTemplate, "the page template holds the data block #{TEMPLATE_DATA_BLOCK} #{parts.length - 1} times, not once"
      end

      escaped = JSON.generate(input).gsub("<", "\\u003c")
      "#{parts[0]}#{DATA_BLOCK_START}#{escaped}</script>#{parts[1]}"
    end
  end
end
