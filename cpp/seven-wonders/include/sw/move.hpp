// Compact, flat move. `card` indexes the acting player's hand (or the discard
// pile for PickDiscard). `seventh` marks a Babylon-B pending inner action, which
// reuses the same fields. Equality is used for legality validation.
#pragma once
#include <cstdint>

namespace sw {

enum class MoveKind : uint8_t { PlayCard, BuildWonder, Discard, PickDiscard, SkipPending };
enum class PayKind : uint8_t { Resources, Chain, FreeBuild };

struct Move {
  MoveKind kind = MoveKind::Discard;
  uint8_t card = 0;       // hand index; discard index for PickDiscard
  uint8_t payLeft = 0;    // coins paid to left neighbour (Resources)
  uint8_t payRight = 0;   // coins paid to right neighbour (Resources)
  PayKind pay = PayKind::Resources;
  bool participate = false;  // Edifice: also join this age's project (BuildWonder)
  bool seventh = false;      // Babylon-B: this is the wrapped 7th-card action

  bool operator==(const Move& o) const {
    if (kind != o.kind || seventh != o.seventh) return false;
    if (kind == MoveKind::SkipPending) return true;
    if (kind == MoveKind::PickDiscard) return card == o.card;
    if (kind == MoveKind::Discard) return card == o.card;
    // Play / BuildWonder
    if (card != o.card || pay != o.pay) return false;
    if (pay == PayKind::Resources && (payLeft != o.payLeft || payRight != o.payRight)) return false;
    if (kind == MoveKind::BuildWonder && participate != o.participate) return false;
    return true;
  }
};

}  // namespace sw
