package auth

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"strings"
	"time"

	"aperture/api/config"
	"aperture/api/db"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

var jwtSecret []byte

func Init(cfg *config.Config) {
	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		panic("JWT_SECRET must be set (at least 32 characters)")
	}
	if len(secret) < 32 {
		panic("JWT_SECRET must be at least 32 characters")
	}
	jwtSecret = []byte(secret)
}

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// Password hashing
func HashPassword(password string) (string, error) {
	bytes, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	return string(bytes), err
}

func CheckPassword(hash, password string) bool {
	err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
	return err == nil
}

// JWT
type Claims struct {
	UserID int `json:"user_id"`
	jwt.RegisteredClaims
}

func GenerateToken(userID int) (string, error) {
	claims := Claims{
		UserID: userID,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(7 * 24 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(jwtSecret)
}

func ParseToken(tokenStr string) (int, error) {
	token, err := jwt.ParseWithClaims(tokenStr, &Claims{}, func(token *jwt.Token) (interface{}, error) {
		if token.Method != jwt.SigningMethodHS256 {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return jwtSecret, nil
	}, jwt.WithExpirationRequired())
	if err != nil {
		return 0, err
	}
	if claims, ok := token.Claims.(*Claims); ok && token.Valid {
		return claims.UserID, nil
	}
	return 0, errors.New("invalid token")
}

// Middleware: extracts auth and sets c.Locals("user_id", int) and c.Locals("project_id", int)
func Middleware() fiber.Handler {
	return func(c *fiber.Ctx) error {
		// Try API key first (SDK requests)
		apiKey := c.Get("X-API-Key")
		if apiKey != "" {
			var projectID int
			err := db.Pool.QueryRow(c.Context(),
				"SELECT id FROM projects WHERE api_key = $1", apiKey).Scan(&projectID)
			if err == nil {
				c.Locals("project_id", projectID)
				c.Locals("auth_method", "api_key")
				return c.Next()
			}
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "invalid api key"})
		}

		// Try JWT (dashboard requests)
		tokenStr := ""
		authHeader := c.Get("Authorization")
		if strings.HasPrefix(authHeader, "Bearer ") {
			tokenStr = strings.TrimPrefix(authHeader, "Bearer ")
		} else {
			tokenStr = c.Cookies("token")
		}

		if tokenStr == "" {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
		}

		userID, err := ParseToken(tokenStr)
		if err != nil {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "invalid token"})
		}

		var projectID int
		selectedProject := strings.TrimSpace(c.Get("X-Aperture-Project"))
		if selectedProject != "" {
			err = db.Pool.QueryRow(c.Context(),
				"SELECT id FROM projects WHERE id::text = $1 AND owner_id = $2", selectedProject, userID).Scan(&projectID)
		} else {
			err = db.Pool.QueryRow(c.Context(),
				"SELECT id FROM projects WHERE owner_id = $1 ORDER BY id LIMIT 1", userID).Scan(&projectID)
		}
		if err != nil {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"error": "Workspace not found or you do not have access to it"})
		}

		c.Locals("user_id", userID)
		c.Locals("project_id", projectID)
		c.Locals("auth_method", "jwt")
		return c.Next()
	}
}

func ProjectID(c *fiber.Ctx) int { pid, _ := c.Locals("project_id").(int); return pid }
func UserID(c *fiber.Ctx) int    { uid, _ := c.Locals("user_id").(int); return uid }
func Dashboard(c *fiber.Ctx) error {
	if c.Locals("auth_method") != "jwt" {
		return fiber.NewError(403, "Dashboard login required")
	}
	return c.Next()
}
func Credential() string {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return hex.EncodeToString(b)
}
