// callmap-go reads the Go files of a branch and of its base, and writes the reader page of the
// review. docs/command-contract.md at the root of the repo gives its command and its flags.
package main

import (
	"fmt"
	"os"
	"os/exec"
	"runtime"
	"slices"
	"strings"
)

// noteLines keeps each note once, in the order of the first run that wrote it, because the base
// and the branch can give the same note.
type noteLines struct {
	lines   []string
	partial string
}

func (notes *noteLines) Write(text []byte) (int, error) {
	notes.partial += string(text)
	for {
		line, rest, found := strings.Cut(notes.partial, "\n")
		if !found {
			return len(text), nil
		}
		notes.partial = rest
		if !slices.Contains(notes.lines, line) {
			notes.lines = append(notes.lines, line)
		}
	}
}

func openerOf(target string) *exec.Cmd {
	switch runtime.GOOS {
	case "darwin":
		return exec.Command("open", target)
	case "windows":
		return exec.Command("rundll32", "url.dll,FileProtocolHandler", target)
	default:
		return exec.Command("xdg-open", target)
	}
}

// A page that does not open is still written, and the command prints its path.
func openInBrowser(target string) {
	openerOf(target).Start()
}

func run(args []string) error {
	cwd, err := os.Getwd()
	if err != nil {
		return err
	}
	read, err := readArguments(args, cwd)
	if err != nil {
		return err
	}
	finished, err := runReview(read)
	if err != nil {
		return err
	}
	for _, note := range finished.notes {
		fmt.Fprintln(os.Stderr, note)
	}
	fmt.Println(finished.out)
	return nil
}

func main() {
	if err := run(os.Args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
