class Checkout
  def initialize
    @order = Order.find(1)
  end

  def run
    receipt = Receipt.new(@order.total)
    receipt.text
  end

  def guess
    order = Order.find_by(id: 1)
    order = load_order if order.nil?
    order.total
  end

  def load_order
    Order.new
  end

  def made
    Order.new.label
  end
end
