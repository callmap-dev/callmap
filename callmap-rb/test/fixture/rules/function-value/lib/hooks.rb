class Hooks
  def run(callable, service, &block)
    yield
    yield(1)
    block.call(2)
    callable.()
    method(:run).call
    service.call
    service.method(:call).call
    self.method(:run).call
  end

  def call; end
end
