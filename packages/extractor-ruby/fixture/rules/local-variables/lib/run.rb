class Run
  def call(given, items)
    invoice = Invoice.new
    invoice.total
    items.each { invoice.total }
    name = "x"
    name.slugify
    cached ||= Invoice.new
    cached.total
    either = Invoice.new
    either = Refund.new
    either.total
    given.total
    first, second = Invoice.new, Invoice.new
    first.total
    shadowed = Invoice.new; items.each { |shadowed| shadowed.total }
  end
end
