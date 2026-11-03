module Shapes
  Point = Struct.new(:x, :y) do
    def norm; end
  end

  Size = Data.define(:width) do
    def area
      norm
    end
  end

  Square = Class.new(Base) do
    def draw
      outline
      Point.new.norm
      Size.area
    end
  end
end
