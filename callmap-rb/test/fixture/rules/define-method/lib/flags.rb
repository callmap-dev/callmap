class Flags
  define_method(:on) do
    reset
  end

  class << self
    define_method "load" do
      new
    end
  end

  %i[a b].each { |flag| define_method(flag) { reset } }

  def reset; end
end
