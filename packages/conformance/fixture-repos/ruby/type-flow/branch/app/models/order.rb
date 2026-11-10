class Order < ActiveRecord::Base
  def total
    1
  end

  def label
    "order".upcase
  end
end
