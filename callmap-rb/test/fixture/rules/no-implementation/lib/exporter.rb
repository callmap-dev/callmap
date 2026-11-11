class Exporter
  def run
    write
  end

  def write
    raise(NotImplementedError)
  end
end
