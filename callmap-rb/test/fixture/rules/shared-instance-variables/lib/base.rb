class Base
  def setup
    @x = Invoice.new
  end

  def run
    @x.total
  end
end
