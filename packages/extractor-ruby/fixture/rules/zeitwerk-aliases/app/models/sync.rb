class Sync
  BodyError = Faraday::Error

  def run
    RequestError::Timeout.build
    BodyError::Timeout.build
    RequestError.build
  end

  def build; end
end
