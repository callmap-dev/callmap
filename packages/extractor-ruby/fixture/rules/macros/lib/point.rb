class Point
  attr_reader :x
  delegate :total, to: :axis

  def norm
    x + total
  end
end
