import unittest

from services.voice.voice_contracts import (
    MAX_TEXT_CHARACTERS,
    VoiceTextError,
    validate_speech_text,
)


class VoiceContractsTest(unittest.TestCase):
    def test_normalizes_safe_text(self):
        self.assertEqual(
            validate_speech_text("  I build   grounded AI systems.\n"),
            "I build grounded AI systems.",
        )

    def test_rejects_empty_non_string_and_oversized_values(self):
        for value in (None, 42, [], "   ", "x" * (MAX_TEXT_CHARACTERS + 1)):
            with self.subTest(value_type=type(value).__name__):
                with self.assertRaises(VoiceTextError):
                    validate_speech_text(value)

    def test_rejects_control_characters_and_performance_tags(self):
        for value in ("I build AI.\x00", "I build AI [laugh].", "Hello [SIGH]."):
            with self.subTest(value=value):
                with self.assertRaises(VoiceTextError):
                    validate_speech_text(value)


if __name__ == "__main__":
    unittest.main()
