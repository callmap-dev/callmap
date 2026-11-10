class Pool
  def self.new; end

  def self.checkout
    new.call
  end

  def call; end
end
