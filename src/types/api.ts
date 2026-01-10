
export interface ShopEntry {
    regularPrice: number;
    finalPrice: number;
    items: {
        name: string;
        description: string;
        images: {
            icon: string;
            smallIcon: string;
        }
    }[];
}

export interface NewsPost {
    title: string;
    body: string;
    image: string;
    date: string;
}

export interface MapData {
    images: {
        blank: string;
        pois: string;
    }
}
