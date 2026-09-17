package allocation

import "testing"

func TestBucketIsStableAndBounded(t *testing.T) {
	want := Bucket(7, "salt", "user", "abc")
	for i := 0; i < 20; i++ {
		if got := Bucket(7, "salt", "user", "abc"); got != want {
			t.Fatalf("unstable bucket: %d then %d", want, got)
		}
	}
	if want < 0 || want >= Buckets {
		t.Fatalf("bucket out of range: %d", want)
	}
	if Bucket(7, "salt", "account", "abc") == want {
		t.Fatal("allocation kind is not part of the bucket key")
	}
}

func TestIncreasingRolloutIsMonotonic(t *testing.T) {
	for i := 0; i < 10_000; i++ {
		bucket := Bucket(1, "gate-salt", "user", string(rune(i)))
		atFive := bucket < 50_000
		atTwentyFive := bucket < 250_000
		if atFive && !atTwentyFive {
			t.Fatal("increasing rollout removed an included unit")
		}
	}
}

func TestIdentityHashIsSecretAndNamespaced(t *testing.T) {
	a := IdentityHash("one", "user", "abc")
	if a == IdentityHash("two", "user", "abc") || a == IdentityHash("one", "account", "abc") {
		t.Fatal("identity hash is not secret and namespaced")
	}
}
