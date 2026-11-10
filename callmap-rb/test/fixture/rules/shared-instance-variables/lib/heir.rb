class Heir < Parent
  include Settable
  include Writable

  def initialize
    @y = Invoice.new
    @z = Invoice.new
    @w = Invoice.new
  end

  def run
    @y.total
    @z.total
    @w.total
  end
end
