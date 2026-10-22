package httpapi

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"reflect"
	"strings"
)

const maxBodyBytes = 64 << 10

// requestError describes a request the handler could not accept before it
// reached the domain layer (malformed JSON, bad query parameters, ...).
type requestError struct {
	status  int
	code    string
	message string
	details []fieldError
}

func badRequest(message string, details ...fieldError) *requestError {
	return &requestError{status: http.StatusBadRequest, code: codeInvalidRequest, message: message, details: details}
}

func writeRequestError(w http.ResponseWriter, e *requestError) {
	writeErrorDetails(w, e.status, e.code, e.message, e.details)
}

// decodeJSON reads exactly one JSON object from the body into dst. Unknown
// fields are rejected so typos (e.g. "lat" instead of "latitude") surface as
// errors instead of being silently dropped.
func decodeJSON(w http.ResponseWriter, r *http.Request, dst any) *requestError {
	mediaType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || mediaType != "application/json" {
		return &requestError{
			status:  http.StatusUnsupportedMediaType,
			code:    codeUnsupportedMediaType,
			message: "Content-Type must be application/json",
		}
	}

	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxBodyBytes))
	dec.DisallowUnknownFields()

	if err := dec.Decode(dst); err != nil {
		return decodeError(err)
	}
	if err := dec.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		return badRequest("request body must contain a single JSON object")
	}
	return nil
}

func decodeError(err error) *requestError {
	var (
		syntaxErr *json.SyntaxError
		typeErr   *json.UnmarshalTypeError
		sizeErr   *http.MaxBytesError
	)

	switch {
	case errors.Is(err, io.EOF):
		return badRequest("request body must not be empty")
	case errors.As(err, &syntaxErr), errors.Is(err, io.ErrUnexpectedEOF):
		return badRequest("request body is not valid JSON")
	case errors.As(err, &typeErr):
		return badRequest("request body contains a value of the wrong type",
			fieldError{Field: typeErr.Field, Message: "must be " + jsonKindName(typeErr.Type)})
	case errors.As(err, &sizeErr):
		return &requestError{
			status:  http.StatusRequestEntityTooLarge,
			code:    codePayloadTooLarge,
			message: fmt.Sprintf("request body must not exceed %d bytes", sizeErr.Limit),
		}
	// encoding/json has no typed error for unknown fields, only this message.
	case strings.HasPrefix(err.Error(), "json: unknown field "):
		field := strings.Trim(strings.TrimPrefix(err.Error(), "json: unknown field "), `"`)
		return badRequest("request body contains an unknown field",
			fieldError{Field: field, Message: "is not a known field"})
	default:
		return badRequest("request body could not be decoded")
	}
}

func jsonKindName(t reflect.Type) string {
	for t.Kind() == reflect.Pointer {
		t = t.Elem()
	}
	switch t.Kind() {
	case reflect.Float32, reflect.Float64, reflect.Int, reflect.Int64:
		return "a number"
	case reflect.String:
		return "a string"
	case reflect.Map, reflect.Struct:
		return "an object"
	default:
		return "a valid value"
	}
}
