class Robot
  def step(name)
    Ledger.send(name)
    Ledger.send(:total)
  end

  def total; end
end
