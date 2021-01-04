import pygame
import pathlib
from math import cos, sin, asin, pi, radians, degrees
from statistics import median

# noinspection SpellCheckingInspection
RESOLUTIONS = {"NONE": (0, 0),
               "CGA": (320, 200),
               "QVGA": (320, 240),
               "CIF": (352, 288),
               "SIF": (383, 288),
               "HVGA": (480, 320),
               "VGA": (640, 480),
               "PAL1": (768, 576),
               "WVGA1": (800, 480),
               "SVGA": (800, 600),
               "WVGA2": (854, 480),
               "PAL2": (1024, 576),
               "WSVGA": (1024, 600),
               "XGA": (1024, 768),
               "XGA+": (1152, 864),
               "HD 720": (1280, 720),
               "WXGA1": (1280, 768),
               "WXGA2": (1280, 800),
               "SXGA": (1280, 1024),
               "SXGA+": (1400, 1050),
               "UXGA": (1600, 1200),
               "WSXGA+": (1680, 1050),
               "HD 1080": (1920, 1080), }


class Game:

    RESOLUTION = RESOLUTIONS["HD 1080"]

    def __init__(self, background, fullscreen=True) -> None:
        pygame.init()

        self.background = pygame.image.load(background)

        if fullscreen:
            self.screen = pygame.display.set_mode(
                RESOLUTIONS["NONE"], pygame.FULLSCREEN)
        else:
            self.screen = pygame.display.set_mode(RESOLUTIONS["HD 720"])

        self.scale_factor_w = self.screen.get_width() / Game.RESOLUTION[0]
        self.scale_factor_h = self.screen.get_height() / Game.RESOLUTION[1]
        self.background = self._rescale(self.background)

        self.deck = []
        self.hand = []
        self.count = 5

    def _rescale(self, surface: pygame.Surface) -> pygame.Surface:
        new_width = round(surface.get_width() * self.scale_factor_w)
        new_height = round(surface.get_height() * self.scale_factor_h)
        return pygame.transform.scale(surface, (new_width, new_height))

    def _background(self) -> pygame.rect:
        return self.screen.blit(self.background, (0, 0))

    def load_deck(self, path: str):
        path = pathlib.Path(path)
        for card in path.glob("**/*"):
            self.deck.append(pygame.image.load(card).convert_alpha())

    def show_hand(self, cards: list):
        if not cards:
            return

        radius = self.screen.get_width() * 0.85
        cen_x = self.screen.get_width() // 2
        cen_y = self.screen.get_height() + radius * 0.90
        max_angle = 90 - degrees(asin(1 / radius * radius * 0.9))
        area_to_work_with = radians(max_angle * 2) * radius

        dist = self._rescale(cards[0]).get_width() * 0.75
        needed = dist * (len(cards) - 1)
        if needed > area_to_work_with:
            dist = area_to_work_with / (len(cards) - 1)
        angle = dist / (2 * radius * pi) * 360

        a = [angle * i for i in range(len(cards))]
        angles_median = median(a)
        a = [angle - angles_median for angle in a]

        for i in range(len(cards)):
            card = pygame.transform.rotate(self._rescale(self.deck[i]), -a[i])
            x = cen_x - radius * cos(radians(90 + a[i])) - card.get_width() / 2
            y = cen_y - radius * sin(radians(90 + a[i])) - card.get_height() / 2
            self.screen.blit(card, (round(x), round(y)))

    def init(self) -> None:
        hand = []

        running = True
        while running:
            for event in pygame.event.get():
                if event.type == pygame.QUIT:
                    running = False

                if event.type == pygame.MOUSEBUTTONUP:
                    hand.append(self.deck.pop(0))

            self._background()
            self.show_hand(hand)
            pygame.display.update()

        pygame.quit()
