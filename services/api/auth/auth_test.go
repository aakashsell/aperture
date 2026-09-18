package auth

import (
	"aperture/api/config"
	"github.com/golang-jwt/jwt/v5"
	"strings"
	"testing"
)

func TestTokenContract(t *testing.T) {
	t.Setenv("JWT_SECRET", strings.Repeat("x", 32))
	Init(&config.Config{})
	token, err := GenerateToken(123)
	if err != nil {
		t.Fatal(err)
	}
	id, err := ParseToken(token)
	if err != nil || id != 123 {
		t.Fatalf("round trip: %v %d", err, id)
	}
	forged, err := jwt.NewWithClaims(jwt.SigningMethodHS256, Claims{UserID: 123}).SignedString(jwtSecret)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = ParseToken(forged); err == nil {
		t.Fatal("accepted token with no expiry")
	}
}
