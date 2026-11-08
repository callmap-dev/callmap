package checkout

import "example.com/shop/gen"

func Audit(cents int) {
	gen.Log(cents)
}
