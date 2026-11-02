class Checkout
  attr_accessor :note

  def initialize
    @invoice = Invoice.new
    @note = Invoice.new
  end

  def refund
    @refund ||= Refund.new
  end

  def run
    @invoice.total
    @refund.total
    @note.total
    @other.total
  end

  def first = @other = Invoice.new
  def second = @other = Invoice.new
end
