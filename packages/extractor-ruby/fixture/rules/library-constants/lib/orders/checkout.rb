module Orders
  class Checkout
    RequestError = ::Faraday::Error
    Absent = Payments::Absent

    def run
      Time.current
      Rails.logger
      ::Faraday::Error.build
      RequestError.build
      Paymnets::Gateway.charge
      Payments::Gatewy.charge
      Bar.x
      Absent.build
      Payments::Gateway.charge
    end

    def current; end
    def logger; end
    def build; end
  end
end
