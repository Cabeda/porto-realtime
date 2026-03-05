FROM golang:1.24-alpine AS builder
RUN apk add --no-cache git
WORKDIR /app
COPY worker/go.mod worker/go.sum ./
RUN go mod download
COPY worker/*.go ./
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /worker .

FROM alpine:3.21
RUN apk add --no-cache ca-certificates tzdata
COPY --from=builder /worker /worker
CMD ["/worker"]
