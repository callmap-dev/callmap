class Receipt
  def initialize(total)
    @total = total
  end

  def text
    @total.to_s
  end
end
