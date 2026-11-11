class Release
  def run
    Order.count
  end
end

Release.new.run

module Archive
  class Order
  end
end
