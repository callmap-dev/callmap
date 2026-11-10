class Robot
  include(*MODULES)
  attr_reader :arm, *PARTS

  def step(*args)
    send(*args)
    public_send(:turn, *args)
  end

  def turn; end
end
