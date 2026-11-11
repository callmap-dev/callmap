class SpecialCopier < Copier
  class << self
    def make
      new(2).call
    end
  end
end
