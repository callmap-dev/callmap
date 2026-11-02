class Person
  prepend Loud
  extend Finders

  def greet; end

  def hello
    greet
  end

  def self.load
    find_all
  end
end
