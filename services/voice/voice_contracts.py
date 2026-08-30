"""Validation shared by the local tests and the deployed voice endpoint."""

import re


MAX_TEXT_CHARACTERS = 700
_CONTROL_CHARACTERS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_PARALINGUISTIC_TAG = re.compile(
    r"\[(?:cough|laugh|chuckle|sigh|gasp|groan|sniff|clear throat)\]",
    re.IGNORECASE,
)


class VoiceTextError(ValueError):
    """Raised when text is unsafe or unsuitable for synthesis."""


def validate_speech_text(value):
    """Return normalized speech text or raise a safe validation error."""

    if not isinstance(value, str):
        raise VoiceTextError("Speech text must be a string.")

    text = " ".join(value.split())
    if not text:
        raise VoiceTextError("Speech text cannot be empty.")
    if len(text) > MAX_TEXT_CHARACTERS:
        raise VoiceTextError(
            "Speech text cannot exceed {} characters.".format(MAX_TEXT_CHARACTERS)
        )
    if _CONTROL_CHARACTERS.search(text):
        raise VoiceTextError("Speech text contains unsupported control characters.")
    if _PARALINGUISTIC_TAG.search(text):
        raise VoiceTextError("Paralinguistic tags are not accepted by this endpoint.")

    return text
