module Units
  def to_cm; end
  module_function :to_cm
  module_function def to_in; end

  module_function

  def to_mm
    to_cm
  end
end
