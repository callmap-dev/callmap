class Exporter
  def run
    write
  end

  def write
    raise NotImplementedError, "a subclass writes"
  end
end
