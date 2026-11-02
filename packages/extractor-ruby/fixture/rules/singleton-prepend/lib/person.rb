class Person
  class << self
    prepend Tracer

    def greet; end
  end

  def self.welcome
    greet
  end

  def run
    greet
  end
end
