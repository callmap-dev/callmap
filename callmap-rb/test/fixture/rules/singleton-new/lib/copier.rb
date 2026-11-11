class Copier
  def self.call(property)
    new(property).call
  end

  def self.build
    copier = self.new(1)
    copier.call
  end

  private_class_method :new

  def initialize(property)
    @property = property
  end

  def call; end
end
