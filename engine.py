import pygame
import pathlib
from math import cos, sin, asin, pi, radians, degrees
from statistics import median
import random

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


class GameSprite(pygame.sprite.Sprite):
    def __init__(self, image: pygame.Surface):
        pygame.sprite.Sprite.__init__(self)

        self.original = image
        self.image = image
        self.rect = image.get_rect()
        self.mask = image.get_masks()

    def rotate(self, angle: float = 0.0, scale: float = 1.0) -> None:
        self.image = pygame.transform.rotozoom(self.original, angle, scale)
        self.rect = self.image.get_rect()

    def update(self) -> None:
        pass


class Card(GameSprite):
    def __init__(self, image: pygame.Surface):
        GameSprite.__init__(self, image)


class Point(pygame.sprite.Sprite):
    def __init__(self, x, y):
        pygame.sprite.Sprite.__init__(self)

        self.image = pygame.Surface((10, 10))
        self.rect = self.image.get_rect()
        self.rect.x = x
        self.rect.y = y


class Game:

    RESOLUTION = RESOLUTIONS["HD 1080"]
    WINDOWED = RESOLUTIONS["VGA"]
    FPS = 30

    def __init__(self, background, fullscreen=True) -> None:
        pygame.init()

        self.clock = pygame.time.Clock()
        self.bg = pygame.image.load(background)

        if fullscreen:
            self.screen = pygame.display.set_mode(
                RESOLUTIONS["NONE"], pygame.FULLSCREEN)
            self.factor = 1
        else:
            self.screen = pygame.display.set_mode(Game.WINDOWED)
            self.factor = Game.WINDOWED[1] / Game.RESOLUTION[1]
            self.bg = pygame.transform.scale(self.bg, Game.WINDOWED)

        self.scale_factor_w = self.screen.get_width() / Game.RESOLUTION[0]
        self.scale_factor_h = self.screen.get_height() / Game.RESOLUTION[1]

        self.cards = []
        self.decks = {}
        self.hand = pygame.sprite.Group()
        self.count = 5

    def _rescale(self, surface: pygame.Surface) -> pygame.Surface:
        new_width = round(surface.get_width() * self.scale_factor_w)
        new_height = round(surface.get_height() * self.scale_factor_h)
        return pygame.transform.scale(surface, (new_width, new_height))

    def _background(self) -> pygame.rect:
        return self.screen.blit(self.bg, (0, 0))

    @staticmethod
    def quit() -> None:
        pygame.quit()

    def load_cards(self, path: str):
        path = pathlib.Path(path)
        for card in path.glob("**/*"):
            image = self._rescale(pygame.image.load(card).convert_alpha())
            self.cards.append(Card(image))

        random.shuffle(self.deck)

    def show_hand(self):
        if not self.hand:
            return

        radius = self.screen.get_width() * 0.85
        center_x = self.screen.get_width() // 2
        center_y = self.screen.get_height() + radius * 0.90
        max_angle = 90 - degrees(asin(1 / radius * radius * 0.9))
        area_to_work_with = radians(max_angle * 2) * radius

        dist = next(iter(self.hand)).rect.width * 0.5
        needed = dist * (len(self.hand) - 1)
        if needed > area_to_work_with:
            dist = area_to_work_with / (len(self.hand) - 1)
        angle = dist / (2 * radius * pi) * 360

        a = [angle * i for i in range(len(self.hand))]
        angles_median = median(a)
        a = [angle - angles_median for angle in a]

        for index, card in enumerate(self.hand):
            card.rotate(-a[index])
            card.rect.x = center_x - radius * cos(radians(90 + a[index])) \
                - card.image.get_rect().width / 2
            card.rect.y = center_y - radius * sin(radians(90 + a[index])) \
                - card.image.get_rect().height / 2

        self.hand.draw(self.screen)
        mouse_pos = pygame.mouse.get_pos()
        s = pygame.sprite.spritecollide(Point(*mouse_pos), self.hand, False)
        if s:
            new_x = round(s[-1].rect.width * 1.5)
            new_y = round(s[-1].rect.height * 1.5)
            new_image = pygame.transform.rotozoom(s[-1].image, 0, 1.5)
            rect_x = (s[-1].rect.x - center_x + s[-1].rect.width / 2) \
                * 1.05 - new_x / 2 + center_x
            rect_y = (s[-1].rect.y - center_y + s[-1].rect.height / 2) \
                * 1.05 - new_y / 2 + center_y

            self.screen.blit(new_image, (rect_x, rect_y))

    def step(self) -> list:
        dt = self.clock.tick(Game.FPS)


