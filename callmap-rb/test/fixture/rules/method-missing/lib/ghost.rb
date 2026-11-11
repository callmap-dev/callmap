class Ghost
  def method_missing(name, *args)
    super
  end

  def haunt
    vanish
  end
end
