class Robot
  def self.build; end

  def step(name, arm)
    send(:turn, 90)
    Robot.public_send "build"
    arm.try(:turn)
    send(name)
    arm.public_send(name, 1)
  end

  def turn(degrees = 0); end
end
